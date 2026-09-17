"""
tests/test_portal_structure_mapper.py — Testes da PARTE 2: Mapeamento Estrutural Passivo

Cobre:
  1. Detecção de abas de navegação e extração de estrutura (tabelas, campos, cards)
  2. Garantia de que botões de AÇÃO nunca são incluídos como seguros
  3. Atualização incremental: abas já mapeadas não são re-varridas
  4. build_llm_context_summary() gera contexto legível e injetável no LLM
  5. Integração com AgenticExecutionLoop: contexto estrutural aparece no turno 1

Todos os testes usam mocks determinísticos — nenhum browser real necessário.
"""

import asyncio
import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from portal_structure_mapper import PortalStructureMapper, _is_action_button, MAPS_DIR


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _fake_page(evaluate_results: list):
    """Cria um mock de page Playwright que retorna `evaluate_results` em sequência."""
    page = MagicMock()
    call_count = [0]

    async def mock_evaluate(script, *args, **kwargs):
        idx = call_count[0]
        result = evaluate_results[idx] if idx < len(evaluate_results) else {}
        call_count[0] += 1
        return result

    page.evaluate = mock_evaluate
    return page


# ─── Teste 1: _is_action_button filtra corretamente ───────────────────────────

def test_is_action_button_bloqueados():
    """Botões de ação devem ser bloqueados."""
    bloqueados = [
        "Salvar", "EXCLUIR", "Enviar resposta", "Cancelar",
        "Confirmar", "Deletar aluno", "Registrar nota", "Gravar",
        "Publicar", "Finalizar", "Sair", "Logout"
    ]
    for texto in bloqueados:
        assert _is_action_button(texto), f"Deveria bloquear: '{texto}'"


def test_is_action_button_seguros():
    """Botões de navegação/leitura NÃO devem ser bloqueados."""
    seguros = [
        "📋 Diário de Classe", "📅 Horários", "💬 Recados",
        "Filtrar por turma", "Ver detalhes", "Próxima página",
        "Pesquisar", "Expandir", "Mostrar mais"
    ]
    for texto in seguros:
        assert not _is_action_button(texto), f"Não deveria bloquear: '{texto}'"


# ─── Teste 2: Detecção correta de tipo de conteúdo ────────────────────────────

@pytest.mark.asyncio
async def test_read_active_tab_classifica_tabela():
    """Aba com tabela deve ter tipo_conteudo contendo 'tabela'."""
    dom_resultado = {
        "tabelas": [
            {
                "id": "tabela_horarios",
                "cabecalhos": ["Horário", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
                "total_linhas": 6,
                "amostra_primeira_linha": ["07h-08h", "Inglês 9B", "—", "—"]
            }
        ],
        "campos": [],
        "cards": [],
        "titulos": ["Grade Semanal de Horários"],
        "botoes_navegacao": [
            {"id": "tab-horarios", "texto": "📅 Horários"},
            {"id": "btn-salvar", "texto": "Salvar"}  # deve ser filtrado
        ]
    }

    page = _fake_page([dom_resultado])
    with tempfile.TemporaryDirectory() as tmp:
        mapper = PortalStructureMapper(page=page, portal_id="teste", maps_dir=Path(tmp))
        resultado = await mapper._read_active_tab_structure("Horários")

    assert "tabela" in resultado["tipo_conteudo"]
    assert "formulario" not in resultado["tipo_conteudo"]
    assert len(resultado["tabelas"]) == 1
    assert resultado["tabelas"][0]["id"] == "tabela_horarios"
    # Botão de ação "Salvar" deve ter sido filtrado
    textos_botoes = [b["texto"] for b in resultado["botoes_navegacao_seguros"]]
    assert "Salvar" not in textos_botoes
    assert "📅 Horários" in textos_botoes


@pytest.mark.asyncio
async def test_read_active_tab_classifica_formulario():
    """Aba com inputs deve ter tipo_conteudo contendo 'formulario'."""
    dom_resultado = {
        "tabelas": [],
        "campos": [
            {"id": "nota_av1", "name": "nota_av1", "tipo": "number", "placeholder": "0-10", "opcoes": []},
            {"id": "presenca", "name": "presenca", "tipo": "checkbox", "placeholder": "", "opcoes": []}
        ],
        "cards": [],
        "titulos": ["Diário de Classe"],
        "botoes_navegacao": []
    }

    page = _fake_page([dom_resultado])
    with tempfile.TemporaryDirectory() as tmp:
        mapper = PortalStructureMapper(page=page, portal_id="teste", maps_dir=Path(tmp))
        resultado = await mapper._read_active_tab_structure("Diário")

    assert "formulario" in resultado["tipo_conteudo"]
    assert len(resultado["campos_formulario"]) == 2


@pytest.mark.asyncio
async def test_read_active_tab_classifica_cards():
    """Aba com cards de recados deve ter tipo_conteudo contendo 'cards'."""
    dom_resultado = {
        "tabelas": [],
        "campos": [],
        "cards": [{"texto_resumo": "Mãe do aluno Hugo Ribeiro: gostaria de saber..."}],
        "titulos": ["Mural de Recados"],
        "botoes_navegacao": []
    }

    page = _fake_page([dom_resultado])
    with tempfile.TemporaryDirectory() as tmp:
        mapper = PortalStructureMapper(page=page, portal_id="teste", maps_dir=Path(tmp))
        resultado = await mapper._read_active_tab_structure("Recados")

    assert "cards" in resultado["tipo_conteudo"]
    assert len(resultado["cards"]) == 1


# ─── Teste 3: map_portal navega por todas as abas ────────────────────────────

@pytest.mark.asyncio
async def test_map_portal_percorre_todas_as_abas():
    """map_portal deve gerar entradas para cada aba listada."""
    tabs_disponiveis = [
        {"id": "tab-diario", "texto": "📋 Diário de Classe"},
        {"id": "tab-horarios", "texto": "📅 Horários"},
        {"id": "tab-recados", "texto": "💬 Recados"},
    ]

    dom_aba_generica = {
        "tabelas": [{"id": "t1", "cabecalhos": ["Col1"], "total_linhas": 3, "amostra_primeira_linha": ["val"]}],
        "campos": [], "cards": [], "titulos": ["Título"], "botoes_navegacao": []
    }

    # Sequência de retornos: [get_nav_tabs, navigate+estrutura x3]
    call_seq = [
        tabs_disponiveis,   # _get_nav_tabs
        True,               # _navigate_to_tab aba 1
        dom_aba_generica,   # _read_active_tab_structure aba 1
        True,               # _navigate_to_tab aba 2
        dom_aba_generica,   # _read_active_tab_structure aba 2
        True,               # _navigate_to_tab aba 3
        dom_aba_generica,   # _read_active_tab_structure aba 3
    ]

    page = MagicMock()
    call_idx = [0]
    sleep_called = [0]

    async def mock_evaluate(script, *args, **kwargs):
        idx = call_idx[0]
        result = call_seq[idx] if idx < len(call_seq) else {}
        call_idx[0] += 1
        return result

    page.evaluate = mock_evaluate

    with tempfile.TemporaryDirectory() as tmp:
        mapper = PortalStructureMapper(page=page, portal_id="sandbox", maps_dir=Path(tmp))

        # Patch asyncio.sleep para não demorar
        with patch("portal_structure_mapper.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            resultado = await mapper.map_portal(delay_between_tabs_s=0.0)

        assert resultado["portal_id"] == "sandbox"
        assert "tabs" in resultado
        assert resultado["total_abas"] == 3

        # Arquivo JSON deve ter sido salvo (verificar dentro do bloco, antes do cleanup)
        mapa_path = Path(tmp) / "sandbox.json"
        assert mapa_path.exists()
        salvo = json.loads(mapa_path.read_text(encoding="utf-8"))
        assert salvo["portal_id"] == "sandbox"
        assert len(salvo["tabs"]) == 3


# ─── Teste 4: Atualização incremental ────────────────────────────────────────

@pytest.mark.asyncio
async def test_map_portal_incremental_nao_re_varre_abas_ja_mapeadas():
    """Se aba já está no mapa salvo, não deve ser re-varrida (sem force_refresh)."""
    with tempfile.TemporaryDirectory() as tmp:
        # Salva mapa já existente com 2 abas
        mapa_existente = {
            "portal_id": "sandbox",
            "total_abas": 2,
            "_portal_id": "sandbox",
            "_saved_at": "2026-01-01T00:00:00",
            "tabs": {
                "tab-diario": {"tab_name": "Diário", "tipo_conteudo": ["formulario"], "mapeado_em": "2026-01-01"},
                "tab-horarios": {"tab_name": "Horários", "tipo_conteudo": ["tabela"], "mapeado_em": "2026-01-01"}
            }
        }
        mapa_path = Path(tmp) / "sandbox.json"
        mapa_path.write_text(json.dumps(mapa_existente), encoding="utf-8")

        # Nav tabs retorna as 2 abas já mapeadas + 1 nova
        tabs_disponiveis = [
            {"id": "tab-diario", "texto": "Diário"},
            {"id": "tab-horarios", "texto": "Horários"},
            {"id": "tab-recados", "texto": "Recados"},  # NOVA
        ]

        dom_recados = {
            "tabelas": [], "campos": [],
            "cards": [{"texto_resumo": "Mensagem da família..."}],
            "titulos": ["Recados"], "botoes_navegacao": []
        }

        call_seq = [
            tabs_disponiveis,   # _get_nav_tabs
            True,               # navigate para Recados (única nova)
            dom_recados,        # estrutura de Recados
        ]
        call_idx = [0]

        page = MagicMock()
        async def mock_evaluate(script, *args, **kwargs):
            idx = call_idx[0]
            result = call_seq[idx] if idx < len(call_seq) else {}
            call_idx[0] += 1
            return result
        page.evaluate = mock_evaluate

        mapper = PortalStructureMapper(page=page, portal_id="sandbox", maps_dir=Path(tmp))
        with patch("portal_structure_mapper.asyncio.sleep", new_callable=AsyncMock):
            resultado = await mapper.map_portal(delay_between_tabs_s=0.0)

        # Deve ter as 2 antigas + 1 nova = 3
        assert resultado["total_abas"] == 3
        assert "tab-recados" in resultado["tabs"]
        # Antigas preservadas como estavam
        assert resultado["tabs"]["tab-diario"]["tipo_conteudo"] == ["formulario"]
        # Total de chamadas ao evaluate: 3 (get_tabs + navigate + estrutura)
        # Se tivesse re-varrido as 2 antigas, seriam 3+4=7 chamadas
        assert call_idx[0] == 3, f"Esperado 3 chamadas, foram {call_idx[0]}"


# ─── Teste 5: build_llm_context_summary gera texto útil ─────────────────────

def test_build_llm_context_summary_com_mapa_salvo():
    """build_llm_context_summary deve gerar texto compacto com info das abas."""
    with tempfile.TemporaryDirectory() as tmp:
        mapa = {
            "portal_id": "sandbox",
            "total_abas": 2,
            "_portal_id": "sandbox",
            "_saved_at": "2026-01-01T00:00:00",
            "tabs": {
                "tab-horarios": {
                    "tab_name": "📅 Horários",
                    "tipo_conteudo": ["tabela"],
                    "titulos": ["Grade Semanal"],
                    "tabelas": [{
                        "id": "tabela_horarios",
                        "cabecalhos": ["Horário", "Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
                        "total_linhas": 6,
                        "amostra_primeira_linha": ["07h-08h", "Inglês"]
                    }],
                    "campos_formulario": [],
                    "cards": [],
                    "botoes_navegacao_seguros": [],
                    "mapeado_em": "2026-01-01T00:00:00"
                },
                "tab-recados": {
                    "tab_name": "💬 Recados",
                    "tipo_conteudo": ["cards"],
                    "titulos": ["Mural de Recados"],
                    "tabelas": [],
                    "campos_formulario": [],
                    "cards": [{"texto_resumo": "Mãe do Hugo..."}],
                    "botoes_navegacao_seguros": [],
                    "mapeado_em": "2026-01-01T00:00:00"
                }
            }
        }
        mapa_path = Path(tmp) / "sandbox.json"
        mapa_path.write_text(json.dumps(mapa), encoding="utf-8")

        page = MagicMock()
        mapper = PortalStructureMapper(page=page, portal_id="sandbox", maps_dir=Path(tmp))
        summary = mapper.build_llm_context_summary()

    assert "[Estrutura conhecida do portal" in summary
    assert "Horários" in summary
    assert "tabela_horarios" in summary
    assert "6 linhas" in summary
    assert "Segunda" in summary  # cabeçalhos da tabela
    assert "Recados" in summary
    assert "1 card" in summary


def test_build_llm_context_summary_sem_mapa_retorna_vazio():
    """Sem mapa salvo, summary deve ser string vazia."""
    with tempfile.TemporaryDirectory() as tmp:
        page = MagicMock()
        mapper = PortalStructureMapper(page=page, portal_id="inexistente", maps_dir=Path(tmp))
        summary = mapper.build_llm_context_summary()
    assert summary == ""


# ─── Teste 6: Integração com AgenticExecutionLoop ────────────────────────────

@pytest.mark.asyncio
async def test_agentic_loop_injeta_contexto_estrutural_no_turno_1():
    """
    O prompt do turno 1 do loop ReAct deve conter o contexto estrutural do portal
    quando um mapa já foi salvo.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from agentic_execution_loop import AgenticExecutionLoop

    prompts_capturados = []

    def fake_llm(prompt: str):
        prompts_capturados.append(prompt)
        return {
            "pensamento": "Vejo a estrutura do portal no contexto.",
            "tool": "finish_task",
            "args": {"resumo": "Teste de injeção de contexto concluído."}
        }

    screen_mock = {
        "activeTab": "Diário",
        "availableTabs": ["📋 Diário de Classe", "📅 Horários"],
        "visiblePanes": [],
        "tables": [],
        "selects": [],
        "buttons": [],
        "inputs": []
    }

    with tempfile.TemporaryDirectory() as tmp:
        # Salva mapa estrutural antes de instanciar o loop
        mapa = {
            "portal_id": "test_portal",
            "_portal_id": "test_portal",
            "_saved_at": "2026-01-01T00:00:00",
            "total_abas": 1,
            "tabs": {
                "tab-horarios": {
                    "tab_name": "📅 Horários",
                    "tipo_conteudo": ["tabela"],
                    "titulos": [],
                    "tabelas": [{"id": "tabela_horarios", "cabecalhos": ["Horário", "Segunda"], "total_linhas": 6, "amostra_primeira_linha": []}],
                    "campos_formulario": [],
                    "cards": [],
                    "botoes_navegacao_seguros": [],
                    "mapeado_em": "2026-01-01T00:00:00"
                }
            }
        }
        mapa_path = Path(tmp) / "test_portal.json"
        mapa_path.write_text(json.dumps(mapa), encoding="utf-8")

        page = MagicMock()
        page.evaluate = AsyncMock(return_value=screen_mock)

        # Instancia loop com maps_dir apontando para o tmp que tem o mapa
        with patch("portal_structure_mapper.MAPS_DIR", Path(tmp)):
            loop = AgenticExecutionLoop(
                page=page,
                portal_id="test_portal",
                custom_llm_caller=fake_llm
            )
            # Força o mapper a usar o diretório tmp
            loop._structure_mapper = PortalStructureMapper(
                page=page, portal_id="test_portal", maps_dir=Path(tmp)
            )
            loop._portal_structure_summary = loop._structure_mapper.build_llm_context_summary()

        result = await loop.run_loop("teste de contexto estrutural")

    assert result["success"] is True
    assert len(prompts_capturados) >= 1
    primeiro_prompt = prompts_capturados[0]
    # O contexto estrutural deve estar no primeiro prompt
    assert "[Estrutura conhecida do portal" in primeiro_prompt
    assert "tabela_horarios" in primeiro_prompt
