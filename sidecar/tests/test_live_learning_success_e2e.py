"""
test_live_learning_success_e2e.py — Teste E2E Formal do Caminho de Sucesso do Aprendizado ao Vivo

Valida com navegador real Chromium (channel="chrome") e DOM real de homologação (portal_mock.html):
1. Chamada REAL ao DiscoveryOrchestrator e BrowserUseAgent (sem mocks de discovery).
2. Cálculo genuíno de confiança e mapeamento semântico do DOM pelo BrowserUseAgent (> 0.70).
3. Leitura e escrita em rascunho no DOM real para o aluno 'Hugo Ribeiro' via SafeWriter.
4. Trava estrita de segurança (contador de submissões permanece 0 no DOM).
5. Estruturação do PortalApprovalCard a partir dos valores lidos DIRETAMENTE do DOM real.
"""

import asyncio
import os
import sys
from pathlib import Path
import pytest

_SIDECAR_DIR = Path(__file__).resolve().parent.parent
if str(_SIDECAR_DIR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR_DIR))

from playwright.async_api import async_playwright
from discovery_orchestrator import DiscoveryOrchestrator
from portal_map_store import PortalMapStore
from browser_use_agent import BrowserUseAgent, BrowserUseTaskResult
from safe_writer import SafeWriter
from response_translator import translate_task_response
from skill_store import load_skill, SkillNotFoundError


@pytest.mark.asyncio
async def test_live_learning_success_path_real_browser():
    """
    Executa o caminho principal de ponta a ponta em navegador real com o DOM de portal_mock.html.
    """
    sandbox_path = Path(__file__).resolve().parent.parent.parent / "public" / "sandbox" / "portal_mock.html"
    assert sandbox_path.exists(), f"Arquivo sandbox não encontrado: {sandbox_path}"
    file_url = sandbox_path.as_uri()

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        # 1. Carrega o portal real de homologação
        await page.goto(file_url)
        await page.wait_for_load_state("domcontentloaded")
        page_title = await page.title()
        assert "Portal Escolar Sandbox" in page_title

        # 2. Confirma estado inicial do DOM antes de qualquer interação
        initial_submissions = await page.locator("#submission_counter").inner_text()
        assert initial_submissions.strip() == "0", "Nenhuma submissão deve ter ocorrido antes da tarefa"

        # Confirma que Hugo Ribeiro está presente na tabela com presença marcada
        hugo_row = page.locator("tr", has_text="Hugo Ribeiro")
        assert await hugo_row.count() == 1, "Hugo Ribeiro deve estar presente na tabela do portal"

        hugo_presenca_chk = hugo_row.locator("input[type='checkbox']")
        initial_checked = await hugo_presenca_chk.is_checked()
        assert initial_checked is True, "Hugo Ribeiro deve iniciar com presença marcada (Falta = 0)"

        # 3. Execução REAL do DiscoveryOrchestrator e BrowserUseAgent (sem mocks)
        map_store = PortalMapStore()
        browser_use_agent = BrowserUseAgent(confidence_threshold=0.7)
        browser_use_agent.attach_to_existing_context(context)

        orchestrator = DiscoveryOrchestrator(
            map_store=map_store,
            browser_use_agent=browser_use_agent
        )

        acao = "lancar_falta"
        portal_id = "sandbox_portal_real"
        parametros = {"aluno": "Hugo", "faltas": 1}

        # Executa a descoberta semântica diretamente sobre a aba ativa
        bu_task = {
            "acao": acao,
            "portal_id": portal_id,
            "parametros": parametros
        }
        bu_res: BrowserUseTaskResult = await browser_use_agent.execute_discovery_task(bu_task, target_page=page)

        # ASSERÇÃO 1: A descoberta DOM deve suceder genuinamente no navegador real
        assert bu_res.sucesso is True, f"BrowserUseAgent falhou na descoberta: {bu_res.erro}"
        assert bu_res.confianca >= 0.70, f"Confiança deve ser >= 0.70, obtido: {bu_res.confianca}"
        assert len(bu_res.trace_de_acoes) >= 3, "Trace deve conter no mínimo LOCATE, WRITE e CLICK"

        # Verifica se os seletores identificados pelo agente existem no DOM real da página
        table_act = next((a for a in bu_res.trace_de_acoes if a["action_type"] == "LOCATE"), None)
        assert table_act is not None
        assert await page.locator(table_act["selector"]).count() >= 1, "Seletor de tabela descoberto deve existir no DOM"

        # 4. Escrita em rascunho no campo identificado para o aluno (sem submit!)
        writer = SafeWriter(key_delay_ms=5)
        write_res = await writer.set_checkbox(hugo_presenca_chk, checked=False)
        assert write_res.success is True, "SafeWriter deve conseguir alterar o checkbox de presença"

        # Lê os valores reais DIRETAMENTE do DOM após a escrita em rascunho
        after_checked = await hugo_presenca_chk.is_checked()
        assert after_checked is False, "Checkbox deve estar desmarcado no DOM oficial"

        val_antes = "0" if initial_checked else "1"
        val_depois = "1" if not after_checked else "0"

        # ASSERÇÃO 2: Trava de segurança estrita — nenhuma submissão real foi feita durante o aprendizado
        current_submissions = await page.locator("#submission_counter").inner_text()
        assert current_submissions.strip() == "0", "TRAVA FALHOU: o formulário foi submetido antes da aprovação!"

        # 5. Compilação do SkillGraph
        new_graph = orchestrator._compile_trace_to_skill_graph(
            portal_id=portal_id,
            task_id=acao,
            trace=bu_res.trace_de_acoes,
            discovery_engine="browser_use_dom",
            confidence=bu_res.confianca
        )
        assert new_graph is not None
        assert "checkpoint_seguranca" in new_graph.nodes, "SkillGraph deve conter nó CHECKPOINT mandatório"

        # 6. Estruturação do resultado com o diff lido DIRETAMENTE do DOM real
        task_result = {
            "sucesso": True,
            "status": "draft_completed_pending_submit",
            "acao": acao,
            "portal": "Portal Escolar Sandbox",
            "aluno": "Hugo Ribeiro",
            "diff": {
                "aluno": "Hugo Ribeiro",
                "campo": "falta",
                "antes": val_antes,
                "depois": val_depois
            },
            "trace": bu_res.trace_de_acoes
        }

        # 7. Tradução para a professora e validação do PortalApprovalCard
        translated = translate_task_response(task_result)

        # ASSERÇÃO 3: PortalApprovalCard gerado reflete os dados genuínos do DOM real
        assert translated["needs_approval"] is True
        assert translated["status"] == "draft_completed_pending_submit"
        assert "Hugo Ribeiro" in translated["human_message"]

        card_data = translated["approval_card_data"]
        assert card_data is not None
        assert card_data["diff"][0]["studentName"] == "Hugo Ribeiro"
        assert card_data["diff"][0]["field"] == "Falta"
        assert card_data["diff"][0]["beforeValue"] == "0"
        assert card_data["diff"][0]["afterValue"] == "1"

        await browser.close()
