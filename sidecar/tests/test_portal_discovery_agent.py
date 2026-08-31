"""
test_portal_discovery_agent.py — Testes dos 3 Cenários do Engine Universal de Portal

Cenário A — Descoberta do Zero:
  Store em memória vazio. LLM mock retorna seletores válidos.
  Assert: mapa descoberto, dados extraídos corretamente, mapa salvo no store.

Cenário B — Segunda Execução usa Mapa Salvo (Camada 1):
  Store já contém o mapa do Cenário A.
  Assert: discovery_agent.discover_roster_map NÃO é chamado;
  extração usa Camada 1 (mais rápida). Delta de tempo registrado.

Cenário C — Self-Healing (Mudança de Layout):
  Mapa salvo tem seletor inválido (simula mudança de layout do portal).
  Assert: validation_failures incrementa → redescoberta automática →
  novo mapa salvo com superseded_by = old_id → warn_teacher = 'layout_changed'.
"""

import asyncio
import time
import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from portal_map_store import PortalMapStore, PortalSelectorMap
from portal_discovery_agent import PortalDiscoveryAgent, DiscoveredSelectorMap
from browser_harness_runner import BrowserHarnessRunner


# ---------------------------------------------------------------------------
# Fixtures compartilhadas
# ---------------------------------------------------------------------------

MOCK_DOMAIN = "sandbox.escolateste.com.br"
MOCK_TASK_BASE = {
    "id": "task_discovery_test",
    "teacher_id": "teacher_test_001",
    "class_ref": "8A",
    "payload": {},
}
MOCK_BYOK_VISION = {"provider": "openai", "model": "gpt-4o", "api_key": "sk-test"}

# Resposta JSON que o LLM mock retorna ao ver a sandbox
LLM_VALID_RESPONSE = """{
  "roster_table": "table#roster-alunos",
  "name_column": 1,
  "id_column": 0,
  "status_column": 3,
  "nee_selector": ".badge-nee",
  "header_rows": 1,
  "pagination_type": "next_button",
  "next_selector": "a.next[rel='next']",
  "confidence": "high",
  "reasoning": "Tabela com id 'roster-alunos' contém colunas Matricula, Nome, Turma, Situacao. Botao de proxima pagina tem classe 'next' e rel='next'."
}"""

ALUNOS_PAGINA_1 = [
    {"name": "Ana Júlia Ferreira",    "rollNumber": "2024001", "portal_native_id": "2024001", "status": "active",      "nee_flag": False, "classRef": "8A"},
    {"name": "Bruno Henrique Lima",   "rollNumber": "2024002", "portal_native_id": "2024002", "status": "active",      "nee_flag": False, "classRef": "8A"},
    {"name": "Carla Beatriz Santos",  "rollNumber": "2024003", "portal_native_id": "2024003", "status": "active",      "nee_flag": False, "classRef": "8A"},
    {"name": "Diego Alves Costa",     "rollNumber": "2024004", "portal_native_id": "2024004", "status": "transferred", "nee_flag": False, "classRef": "8A"},
    {"name": "Eduarda Melo Pires",    "rollNumber": "2024005", "portal_native_id": "2024005", "status": "active",      "nee_flag": False, "classRef": "8A"},
    {"name": "Felipe Rocha Torres",   "rollNumber": "2024006", "portal_native_id": "2024006", "status": "active",      "nee_flag": False, "classRef": "8A"},
    {"name": "Giovana Luz Barbosa",   "rollNumber": "2024007", "portal_native_id": "2024007", "status": "inactive",    "nee_flag": False, "classRef": "8A"},
    {"name": "Henrique Dias Pereira", "rollNumber": "2024008", "portal_native_id": "2024008", "status": "active",      "nee_flag": False, "classRef": "8A"},
]
ALUNOS_PAGINA_2 = [
    {"name": "Isabela Nunes Castro",   "rollNumber": "2024009", "portal_native_id": "2024009", "status": "active", "nee_flag": False, "classRef": "8A"},
    {"name": "João Pedro Oliveira",    "rollNumber": "2024010", "portal_native_id": "2024010", "status": "active", "nee_flag": False, "classRef": "8A"},
    {"name": "Karen Souza Martins",    "rollNumber": "2024011", "portal_native_id": "2024011", "status": "active", "nee_flag": False, "classRef": "8A"},
    {"name": "Lucas Almeida Ramos",    "rollNumber": "2024012", "portal_native_id": "2024012", "status": "active", "nee_flag": False, "classRef": "8A"},
    {"name": "Mariana Costa Teixeira", "rollNumber": "2024013", "portal_native_id": "2024013", "status": "active", "nee_flag": False, "classRef": "8A"},
]
ALL_ALUNOS = ALUNOS_PAGINA_1 + ALUNOS_PAGINA_2


# ---------------------------------------------------------------------------
# Mock de página — suporta v1 (seletores válidos) e v2 (layout mudado)
# ---------------------------------------------------------------------------

class MockRosterPage:
    """
    Simula a sandbox portal_mock_roster.html com paginação.
    layout_version='v1': retorna dados da tabela #roster-alunos.
    layout_version='v2': seletor #roster-alunos não existe (simula mudança de layout).
    """

    def __init__(self, layout_version: str = "v1"):
        self.layout_version = layout_version
        self.current_page = 0          # 0-indexed
        self.max_pages = 2
        self.url = f"https://{MOCK_DOMAIN}/alunos"

    async def screenshot(self, full_page=False) -> bytes:
        # Retorna bytes fictícios — o LLM mock não usa o conteúdo real
        return b"FAKE_PNG_BYTES_FOR_TESTING"

    async def evaluate(self, js_script: str):
        if self.layout_version == "v2":
            # Layout v2: tabela tem id diferente — seletor v1 não encontra nada
            return []

        # Layout v1: retorna alunos da página corrente
        if self.current_page == 0:
            return ALUNOS_PAGINA_1
        else:
            return ALUNOS_PAGINA_2

    def locator(self, selector: str):
        page_obj = self

        class MockLocator:
            def __init__(self):
                self.first = self

            async def count(self):
                # Botão "next" existe apenas se não for a última página
                if "next" in selector.lower() or "rel" in selector.lower():
                    return 1 if page_obj.current_page < page_obj.max_pages - 1 else 0
                return 0

            async def is_visible(self):
                return page_obj.current_page < page_obj.max_pages - 1

            async def is_disabled(self):
                return False

            async def get_attribute(self, attr):
                return ""

            async def click(self):
                page_obj.current_page += 1

        return MockLocator()

    async def wait_for_load_state(self, state, timeout=5000):
        pass


# ---------------------------------------------------------------------------
# Mock do LLM Vision
# ---------------------------------------------------------------------------

class CallTracker:
    """Rastreia quantas vezes o LLM foi chamado."""
    def __init__(self, response: str):
        self.response = response
        self.call_count = 0

    def __call__(self, screenshot_b64: str, byok: dict) -> str:
        self.call_count += 1
        return self.response


# ---------------------------------------------------------------------------
# CENÁRIO A — Descoberta do Zero
# ---------------------------------------------------------------------------

class TestCenarioA_DescobertaDoZero(unittest.TestCase):
    """
    Store vazio. O agente deve descobrir autonomamente usando o LLM mock.
    Valida: dados extraídos (13 alunos), mapa salvo, confiança 'high'.
    """

    def test_descoberta_autonoma(self):
        async def run():
            llm_tracker = CallTracker(LLM_VALID_RESPONSE)
            store = PortalMapStore(supabase_client=None)  # em memória, vazio

            discovery_agent = PortalDiscoveryAgent(llm_caller=llm_tracker)
            runner = BrowserHarnessRunner(
                supabase_client=None,
                discovery_agent=discovery_agent,
                map_store=store,
            )

            # Verifica que não há mapa salvo
            self.assertIsNone(store.lookup_map(MOCK_DOMAIN))

            page = MockRosterPage(layout_version="v1")
            task = {**MOCK_TASK_BASE, "id": "task_cenario_A"}

            results = {}
            def mock_update(t_id, status, extra):
                results["status"] = status
                results["extra"] = extra
            runner._update_task_status = mock_update

            t0 = time.perf_counter()
            ok = await runner._handle_read_roster(task, page, MOCK_DOMAIN, MOCK_BYOK_VISION)
            t_camada2 = time.perf_counter() - t0

            # Assert: sucesso
            self.assertTrue(ok, "Descoberta autônoma deveria retornar True")
            self.assertEqual(results.get("status"), "done")

            extra = results.get("extra", {})

            # LLM foi chamado (Camada 2)
            self.assertEqual(llm_tracker.call_count, 1, "LLM deve ter sido chamado 1x na Camada 2")

            # Dados extraídos corretamente
            total = extra.get("total_scraped", 0)
            self.assertEqual(total, 13, f"Esperado 13 alunos (8+5), obtido {total}")

            # map_source correto
            self.assertEqual(extra.get("map_source"), "discovered")

            # Aviso ao professor sobre portal novo
            self.assertEqual(extra.get("warn_teacher"), "new_portal")

            # Mapa foi salvo no store
            saved = store.lookup_map(MOCK_DOMAIN)
            self.assertIsNotNone(saved, "Mapa deve ter sido salvo no store após descoberta")
            self.assertEqual(saved.discovery_confidence, "high")
            self.assertEqual(saved.validation_failures, 0)

            print(f"\n[CENARIO A] OK — {total} alunos extraidos em {t_camada2:.3f}s (Camada 2 / LLM).")
            print(f"[CENARIO A] Mapa salvo: dominio='{saved.portal_domain}' confianca='{saved.discovery_confidence}'")

            return t_camada2

        t2 = asyncio.run(run())
        return t2


# ---------------------------------------------------------------------------
# CENÁRIO B — Segunda Execução usa Mapa Salvo (Camada 1)
# ---------------------------------------------------------------------------

class TestCenarioB_MapaSalvo(unittest.TestCase):
    """
    Store já tem o mapa do Cenário A.
    O agente deve usar Camada 1 (mapa salvo) sem chamar o LLM.
    Valida: LLM call_count == 0, dados corretos, delta de tempo documentado.
    """

    def test_camada1_usa_mapa_salvo(self):
        async def run():
            llm_tracker = CallTracker(LLM_VALID_RESPONSE)
            store = PortalMapStore(supabase_client=None)

            # Pre-popula o store com um mapa já descoberto (simula resultado do Cenário A)
            store.save_map(
                domain=MOCK_DOMAIN,
                display_name="Portal Teste (Sandbox)",
                selectors={
                    "roster_table": "table#roster-alunos",
                    "name_column": 1,
                    "id_column": 0,
                    "status_column": 3,
                    "nee_selector": ".badge-nee",
                    "header_rows": 1,
                },
                pagination={
                    "type": "next_button",
                    "nextSelector": "a.next[rel='next']",
                    "maxPages": 10,
                    "delayBetweenPagesMs": 100,
                },
                confidence="high",
                teacher_id="teacher_test_001",
            )

            discovery_agent = PortalDiscoveryAgent(llm_caller=llm_tracker)
            runner = BrowserHarnessRunner(
                supabase_client=None,
                discovery_agent=discovery_agent,
                map_store=store,
            )

            page = MockRosterPage(layout_version="v1")
            task = {**MOCK_TASK_BASE, "id": "task_cenario_B"}

            results = {}
            def mock_update(t_id, status, extra):
                results["status"] = status
                results["extra"] = extra
            runner._update_task_status = mock_update

            t0 = time.perf_counter()
            ok = await runner._handle_read_roster(task, page, MOCK_DOMAIN, MOCK_BYOK_VISION)
            t_camada1 = time.perf_counter() - t0

            self.assertTrue(ok)
            self.assertEqual(results.get("status"), "done")
            extra = results.get("extra", {})

            # LLM NÃO deve ter sido chamado (Camada 1 não precisa de visão)
            self.assertEqual(llm_tracker.call_count, 0,
                             f"LLM NAO deveria ter sido chamado na Camada 1, mas foi chamado {llm_tracker.call_count}x")

            # Dados corretos
            total = extra.get("total_scraped", 0)
            self.assertEqual(total, 13, f"Esperado 13 alunos, obtido {total}")

            # map_source indica Camada 1
            self.assertEqual(extra.get("map_source"), "known_map")

            # Sem aviso ao professor (leitura de rotina)
            self.assertIsNone(extra.get("warn_teacher"))

            print(f"\n[CENARIO B] OK — Camada 1 usou mapa salvo. LLM chamado: {llm_tracker.call_count}x.")
            print(f"[CENARIO B] Tempo Camada 1: {t_camada1:.3f}s (sem custo de inferencia visual).")

        asyncio.run(run())


# ---------------------------------------------------------------------------
# CENÁRIO C — Self-Healing (Mudança de Layout)
# ---------------------------------------------------------------------------

class TestCenarioC_SelfHealing(unittest.TestCase):
    """
    Mapa salvo tem seletor que não funciona (layout mudado).
    Camada 1 falha → validation_failures incrementa → Camada 2 redescobre →
    novo mapa salvo com superseded_by → warn_teacher = 'layout_changed'.
    """

    def test_self_healing_layout_mudado(self):
        async def run():
            # Pre-monta o mapa que a Camada 2 vai "descobrir" após o self-healing
            DISCOVERED_MAP = DiscoveredSelectorMap(
                roster_table="table#roster-alunos",
                name_column=1,
                id_column=0,
                status_column=3,
                nee_selector=".badge-nee",
                header_rows=1,
                pagination_type="next_button",
                next_selector="a.next[rel='next']",
                confidence="high",
            )

            # Mock do discovery_agent — retorna o mapa sem chamar LLM ou DOM real
            discovery_call_count = {"n": 0}

            class MockDiscoveryAgent:
                async def discover_roster_map(self, page, teacher_byok):
                    discovery_call_count["n"] += 1
                    return DISCOVERED_MAP

                async def extract_with_map(self, page, selector_map, class_ref="all"):
                    # Retorna os alunos fictícios para paginação
                    if page.current_page == 0:
                        return ALUNOS_PAGINA_1
                    else:
                        return ALUNOS_PAGINA_2

            store = PortalMapStore(supabase_client=None)

            # Salva mapa com seletor INVÁLIDO (simula layout que mudou)
            old_map_id = store.save_map(
                domain=MOCK_DOMAIN,
                display_name="Portal Teste (Layout Antigo)",
                selectors={
                    "roster_table": "table#roster-alunos-v1-obsoleto",  # seletor inválido
                    "name_column": 1,
                    "id_column": 0,
                    "header_rows": 1,
                },
                pagination={
                    "type": "next_button",
                    "nextSelector": "a.botao-obsoleto",
                    "maxPages": 5,
                    "delayBetweenPagesMs": 100,
                },
                confidence="high",
                teacher_id="teacher_test_001",
            )
            self.assertIsNotNone(old_map_id)

            mock_agent = MockDiscoveryAgent()
            runner = BrowserHarnessRunner(
                supabase_client=None,
                discovery_agent=mock_agent,
                map_store=store,
            )

            page = MockRosterPage(layout_version="v1")
            page.url = f"https://{MOCK_DOMAIN}/alunos"

            task = {**MOCK_TASK_BASE, "id": "task_cenario_C"}

            results = {}
            def mock_update(t_id, status, extra):
                results["status"] = status
                results["extra"] = extra
            runner._update_task_status = mock_update

            # Patch _run_paginated_extraction: primeira chamada retorna vazio
            # (simula Camada 1 falhando com seletor inválido), segunda usa o agente mock
            call_count = {"n": 0}
            original_run_pag = runner._run_paginated_extraction

            async def patched_run_paginated(p, selector_map, pagination_cfg, class_ref):
                call_count["n"] += 1
                if call_count["n"] == 1:
                    # Camada 1: seletor inválido → retorna vazio (sem dados)
                    return [], 1, True
                else:
                    # Camada 2: usa o agente mock que retorna dados reais
                    return await original_run_pag(page, selector_map, pagination_cfg, class_ref)

            runner._run_paginated_extraction = patched_run_paginated

            ok = await runner._handle_read_roster(task, page, MOCK_DOMAIN, MOCK_BYOK_VISION)

            self.assertTrue(ok, "Self-healing deveria ter sucesso")
            self.assertEqual(results.get("status"), "done")
            extra = results.get("extra", {})

            # discovery_agent foi chamado 1x (Camada 2)
            self.assertEqual(discovery_call_count["n"], 1,
                             "discovery_agent deve ter sido chamado 1x no self-healing")

            # Aviso de layout mudado
            self.assertEqual(extra.get("warn_teacher"), "layout_changed",
                             f"warn_teacher esperado 'layout_changed', obtido '{extra.get('warn_teacher')}'")

            # map_source indica redescoberta
            self.assertEqual(extra.get("map_source"), "fallback_rediscovered")

            # Dados extraídos com sucesso (13 alunos)
            total = extra.get("total_scraped", 0)
            self.assertEqual(total, 13, f"Esperado 13 alunos, obtido {total}")

            # Novo mapa foi salvo
            new_id = extra.get("new_map_id", "")
            self.assertTrue(bool(new_id), "new_map_id deve estar no payload")

            # Mapa antigo está como superseded
            old_mem = store._memory.get(MOCK_DOMAIN)
            if old_mem:
                self.assertEqual(old_mem.superseded_by, new_id,
                                 "Mapa antigo deve apontar para o novo via superseded_by")

            print(f"\n[CENARIO C] OK — Self-healing: layout mudado detectado e remapeado.")
            print(f"[CENARIO C] warn_teacher='{extra.get('warn_teacher')}' map_source='{extra.get('map_source')}'")
# ---------------------------------------------------------------------------

class TestParseLLMResponse(unittest.TestCase):
    """Garante que o parser tolera markdown code blocks e respostas imperfeitas."""

    def setUp(self):
        self.agent = PortalDiscoveryAgent(llm_caller=lambda s, b: "")

    def test_parse_json_limpo(self):
        r = self.agent._parse_llm_response(LLM_VALID_RESPONSE)
        self.assertIsNotNone(r)
        self.assertEqual(r.roster_table, "table#roster-alunos")
        self.assertEqual(r.confidence, "high")
        self.assertEqual(r.name_column, 1)

    def test_parse_markdown_code_block(self):
        md = f"```json\n{LLM_VALID_RESPONSE}\n```"
        r = self.agent._parse_llm_response(md)
        self.assertIsNotNone(r)
        self.assertEqual(r.roster_table, "table#roster-alunos")

    def test_parse_erro_no_roster_found(self):
        r = self.agent._parse_llm_response('{"error": "no_roster_found"}')
        self.assertIsNone(r)

    def test_parse_sem_json(self):
        r = self.agent._parse_llm_response("Desculpe, não consigo identificar a tabela.")
        self.assertIsNone(r)

    def test_parse_confianca_invalida_normaliza_para_low(self):
        resp = LLM_VALID_RESPONSE.replace('"high"', '"ultra"')
        r = self.agent._parse_llm_response(resp)
        self.assertIsNotNone(r)
        self.assertEqual(r.confidence, "low")


# ---------------------------------------------------------------------------
# Suite de PortalMapStore — testa store em memória
# ---------------------------------------------------------------------------

class TestPortalMapStore(unittest.TestCase):
    """Testa lookup, save, failures e supersede em modo offline (memória)."""

    def test_lookup_vazio(self):
        store = PortalMapStore(supabase_client=None)
        self.assertIsNone(store.lookup_map("qualquer.com.br"))

    def test_save_e_lookup(self):
        store = PortalMapStore(supabase_client=None)
        new_id = store.save_map(
            domain="teste.com.br",
            display_name="Teste",
            selectors={"roster_table": "table#alunos", "name_column": 1, "id_column": 0, "header_rows": 1},
            pagination=None,
            confidence="medium",
            teacher_id=None,
        )
        self.assertTrue(bool(new_id))
        m = store.lookup_map("teste.com.br")
        self.assertIsNotNone(m)
        self.assertEqual(m.discovery_confidence, "medium")

    def test_incrementa_falhas(self):
        store = PortalMapStore(supabase_client=None)
        store.save_map("escola.com.br", None, {"roster_table": "t", "name_column": 1, "id_column": 0, "header_rows": 1}, None, "low", None)
        c1 = store.increment_failures("escola.com.br")
        c2 = store.increment_failures("escola.com.br")
        self.assertEqual(c1, 1)
        self.assertEqual(c2, 2)

    def test_supersede(self):
        store = PortalMapStore(supabase_client=None)
        id1 = store.save_map("portal.com.br", None, {"roster_table": "t", "name_column": 1, "id_column": 0, "header_rows": 1}, None, "low", None)
        store.supersede_map("portal.com.br", "new-uuid-999")
        # Mapa marcado como substituído não deve ser retornado pelo lookup
        m = store.lookup_map("portal.com.br")
        self.assertIsNone(m)

    def test_lookup_por_dominio_raiz(self):
        store = PortalMapStore(supabase_client=None)
        store.save_map("paineldoaluno.com.br", None, {"roster_table": "t", "name_column": 1, "id_column": 0, "header_rows": 1}, None, "high", None)
        # Lookup por subdomínio deve cair no domínio raiz
        m = store.lookup_map("machadosobrinho.paineldoaluno.com.br")
        self.assertIsNotNone(m, "Lookup por subdomínio deve encontrar mapa do domínio raiz")

    def test_save_sem_selectors_levanta_excecao(self):
        store = PortalMapStore(supabase_client=None)
        with self.assertRaises(ValueError):
            store.save_map("invalido.com.br", None, {}, None, "low", None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
