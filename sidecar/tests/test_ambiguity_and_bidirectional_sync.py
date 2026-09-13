"""
sidecar/tests/test_ambiguity_and_bidirectional_sync.py — Testes de Regressão: Ambiguidade Silenciosa e Sincronização

Cobre rigorosamente:
1. PRIORIDADE 0: Turma com 2 alunos com nomes parecidos ("Hugo Henrique Lima" e "Hugo Henrique Souza").
   - Confirmar que buscar "Hugo" NUNCA escolhe a primeira linha silenciosamente.
   - Deve retornar status='ambiguous' e a lista de candidatos para desambiguação humana.
2. PRIORIDADE 0: Desempate com matrícula (portal_native_id):
   - Ao passar matrícula "102", desempata deterministicamente para "Hugo Henrique Souza".
3. PRIORIDADE 2: Escrita Relativa com Detecção de Conflito no SafeWriter:
   - Lê valor do DOM em tempo real e sinaliza conflito se o cache divergir da página.
4. Motor de Reconciliação Unificado (student_matcher.py):
   - 4 vias de correspondência com prioridade estrita de matrícula.
"""

import asyncio
import os
import sys
from pathlib import Path
import pytest
from unittest.mock import AsyncMock, MagicMock

_PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(_PROJECT_DIR))
_SIDECAR_DIR = _PROJECT_DIR / "sidecar"
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from safe_writer import SafeWriter, WriteResult
from student_matcher import match_student_4_ways, normalize_student_name


# Mock HTML com dois alunos de nomes muito parecidos
SANDBOX_AMBIGUOUS_HTML = """
<!DOCTYPE html>
<html>
<body>
  <table id="roster-table">
    <thead>
      <tr>
        <th>Matrícula</th>
        <th>Nome do Aluno</th>
        <th>Nota 1</th>
        <th>Ações</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>101</td>
        <td>Hugo Henrique Lima</td>
        <td><input type="number" id="nota_101" name="nota_101" value="8.0" /></td>
        <td><button type="submit" id="btn_101">Salvar</button></td>
      </tr>
      <tr>
        <td>102</td>
        <td>Hugo Henrique Souza</td>
        <td><input type="number" id="nota_102" name="nota_102" value="7.5" /></td>
        <td><button type="submit" id="btn_102">Salvar</button></td>
      </tr>
      <tr>
        <td>103</td>
        <td>Mariana Silva</td>
        <td><input type="number" id="nota_103" name="nota_103" value="9.0" /></td>
        <td><button type="submit" id="btn_103">Salvar</button></td>
      </tr>
    </tbody>
  </table>
</body>
</html>
"""


@pytest.mark.asyncio
async def test_regression_ambiguity_blocks_silent_execution():
    """
    PRIORIDADE 0 (Bloqueante):
    Quando há mais de um aluno correspondente (ex: 'Hugo' em turma com Hugo Henrique Lima e Hugo Henrique Souza),
    o BrowserUseAgent NUNCA deve aplicar a ação na primeira linha silenciosamente.
    Deve retornar status='ambiguous' e a lista completa de candidatos.
    """
    agent = BrowserUseAgent()

    mock_page = AsyncMock()

    async def mock_evaluate(script, payload=None):
        # Simula a execução do script js_inspect sobre o SANDBOX_AMBIGUOUS_HTML
        student_name = payload.get("studentName", "").lower() if payload else ""
        matricula = payload.get("matricula", "") if payload else ""

        if student_name == "hugo" and not matricula:
            return {
                "hasTable": True,
                "rowsCount": 3,
                "foundInput": True,
                "targetRowFound": False,
                "isAmbiguous": True,
                "ambiguousCandidates": [
                    {"index": 1, "name": "Hugo Henrique Lima", "matricula": "101", "details": "101 Hugo Henrique Lima"},
                    {"index": 2, "name": "Hugo Henrique Souza", "matricula": "102", "details": "102 Hugo Henrique Souza"}
                ],
                "bestScore": 50,
                "confidence": 0.40
            }
        elif matricula == "102" or "souza" in student_name:
            return {
                "hasTable": True,
                "rowsCount": 3,
                "foundInput": True,
                "targetRowFound": True,
                "targetRowSelector": "#roster-table tbody tr:nth-child(2)",
                "inputSelector": "#nota_102",
                "inputType": "number",
                "isAmbiguous": False,
                "ambiguousCandidates": [],
                "bestScore": 80,
                "confidence": 0.90
            }
        return {"hasTable": True, "rowsCount": 3, "foundInput": False, "targetRowFound": False, "confidence": 0.2}

    mock_page.evaluate = mock_evaluate
    mock_page.frames = [mock_page]

    # 1. Executa tarefa com nome genérico "Hugo" (ambíguo!)
    task_ambigua = {
        "acao": "lancar_nota",
        "aluno": "Hugo",
        "valor": 9.0,
        "objeto_alvo": "nota"
    }
    res = await agent._inspect_semantic_dom(mock_page, task_ambigua)

    # Asserção Crítica 1: Ambiguidade detectada, sucesso = False, status = 'ambiguous'
    assert res["success"] is False
    assert res["is_ambiguous"] is True
    assert len(res["candidates"]) == 2
    assert "Hugo Henrique Lima" in str(res["candidates"])
    assert "Hugo Henrique Souza" in str(res["candidates"])
    assert "Ambiguidade" in res["disambiguation_prompt"]

    # 2. Executa via execute_discovery_task para checar contrato do BrowserUseTaskResult
    agent._inspect_semantic_dom = AsyncMock(return_value=res)
    agent._has_next_page = AsyncMock(return_value=False)

    bu_res = await agent.execute_discovery_task(task_ambigua, target_page=mock_page)
    assert bu_res.sucesso is False
    assert bu_res.status == "ambiguous"
    assert bu_res.requires_escalation is False  # NUNCA deve escalar pro Skyvern!
    assert len(bu_res.candidates) == 2


@pytest.mark.asyncio
async def test_matricula_breaks_ambiguity_deterministically():
    """
    PRIORIDADE 0 / PRIORIDADE 1:
    Quando a matrícula (portal_native_id) é fornecida, ela desempata a ambiguidade
    imediatamente sem exigir intervenção, identificando a linha exata.
    """
    agent = BrowserUseAgent()
    mock_page = AsyncMock()

    async def mock_evaluate(script, payload=None):
        matricula = payload.get("matricula", "")
        assert matricula == "102"
        return {
            "hasTable": True,
            "rowsCount": 3,
            "foundInput": True,
            "targetRowFound": True,
            "targetRowSelector": "#roster-table tbody tr:nth-child(2)",
            "inputSelector": "#nota_102",
            "inputType": "number",
            "isAmbiguous": False,
            "ambiguousCandidates": [],
            "bestScore": 95,
            "confidence": 0.95
        }

    mock_page.evaluate = mock_evaluate
    mock_page.frames = [mock_page]

    task_com_matricula = {
        "acao": "lancar_nota",
        "aluno": "Hugo",
        "matricula": "102",
        "valor": 9.0,
        "objeto_alvo": "nota"
    }
    res = await agent._inspect_semantic_dom(mock_page, task_com_matricula)

    assert res["success"] is True
    assert res["target_row_found"] is True
    assert any("#nota_102" in a.get("selector", "") for a in res["actions"])


def test_student_matcher_4_ways_unification():
    """
    PRIORIDADE 1: Testa o motor de matching em 4 vias espelhando o rosterReconciler.ts:
    1. Matrícula prioritária.
    2. Detecção estrita de múltiplos Hugos sem escolha silenciosa.
    """
    roster = [
        {"name": "Hugo Henrique Lima", "matricula": "101", "classRef": "9A"},
        {"name": "Hugo Henrique Souza", "matricula": "102", "classRef": "9A"},
        {"name": "Mariana Silva", "matricula": "103", "classRef": "9A"}
    ]

    # Teste A: Busca "Hugo" sem matrícula -> DEVE retornar status='ambiguous'
    match_a = match_student_4_ways("Hugo", roster)
    assert match_a.status == "ambiguous"
    assert match_a.student is None
    assert len(match_a.candidates) == 2

    # Teste B: Busca com matrícula "102" -> DEVE retornar status='exact' para Hugo Henrique Souza
    match_b = match_student_4_ways("Hugo", roster, query_matricula="102")
    assert match_b.status == "exact"
    assert match_b.student is not None
    assert match_b.student.name == "Hugo Henrique Souza"
    assert match_b.student.matricula == "102"

    # Teste C: Aluno único exato
    match_c = match_student_4_ways("Mariana Silva", roster)
    assert match_c.status == "exact"
    assert match_c.student.matricula == "103"


@pytest.mark.asyncio
async def test_safe_writer_relative_write_conflict_detection():
    """
    PRIORIDADE 2:
    SafeWriter.compute_and_write_relative_value deve:
    1. Ler o DOM vivo como base matemática.
    2. Sinalizar conflito se o cache esperado divergir do DOM vivo.
    """
    writer = SafeWriter()
    mock_locator = AsyncMock()

    # O DOM vivo no portal tem nota '7.5'
    mock_locator.input_value = AsyncMock(return_value="7.5")
    mock_locator.focus = AsyncMock()
    mock_locator.fill = AsyncMock()
    mock_locator.press_sequentially = AsyncMock()
    mock_locator.dispatch_event = AsyncMock()

    # Cenário: O app/banco acreditava em cache que a nota era '8.0', e a professora pediu "+0.5"
    res, conflict = await writer.compute_and_write_relative_value(
        locator=mock_locator,
        delta=0.5,
        expected_cached_base=8.0
    )

    # 1. O SafeWriter detectou a discrepância contra o cache
    assert conflict["conflict_detected"] is True
    assert conflict["dom_value_at_write"] == 7.5
    assert conflict["cached_base"] == 8.0
    assert "Aviso de conflito externo" in conflict["warning"]

    # 2. A base matemática usada foi o DOM real (7.5 + 0.5 = 8.0), não o cache (8.0 + 0.5 = 8.5)
    # mock_locator.press_sequentially foi chamado com "8" ou "8.0"
    called_val = mock_locator.press_sequentially.call_args[0][0]
    assert called_val in ("8", "8.0")
